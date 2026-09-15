"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { InvoiceCustomerInput } from "@/services/invoice-customers";
import {
  invoiceCustomerSaveFailure,
  validateInvoiceCustomerDraft,
  type InvoiceCustomerDraft,
  type InvoiceCustomerField,
} from "./invoice-customer-draft";

interface InvoiceCustomerFormProps {
  /** What the form opens with: a blank draft, or a stored row's. */
  initialDraft: InvoiceCustomerDraft;
  /** The submit button's words — "Create customer" or "Save changes". */
  submitLabel: string;
  /**
   * Save, then leave. **Throws** on refusal, so the form renders the reason —
   * the same contract the product form's shell takes, and the reason the
   * wrapper never holds an error of its own.
   *
   * On success the wrapper navigates and this page unmounts, which is why the
   * committing flag below is never cleared on that path.
   */
  onSubmit: (input: InvoiceCustomerInput) => Promise<void>;
  /** Where the negative half of the footer goes. */
  onCancel: () => void;
}

/**
 * The create and edit form for one Fennoa invoice customer.
 *
 * **Presentational end to end**: it takes a draft and a submit function and
 * knows nothing about React Query, which is what lets the create page, the edit
 * page and the preview scene render this exact component — the scene hands it a
 * submit that refuses, and what a reviewer looks at is the real error state
 * rather than a drawing of one.
 *
 * **The contract validates, this only says so.** Every rule lives in
 * `invoiceCustomerInput`, shared with the service and mirrored by the table's
 * CHECKs; the form's job is to turn the first failure into a sentence naming a
 * field the admin can see. The fields carry no `required` attribute for the same
 * reason: the browser's own bubble would pre-empt that sentence with one written
 * by the browser vendor, in the browser's language rather than the reader's.
 *
 * **The invoice text is a plain textarea and must stay one.** Every other
 * multi-line field an admin authors in this app is markdown rendered through the
 * shared renderer; this one is emitted verbatim into an XML element that a
 * finance system prints on a paper invoice, so a `##` typed into it would reach
 * a municipality as two hash marks. Nothing here renders it, so there is nothing
 * for rich text to be rich in.
 */
export function InvoiceCustomerForm({
  initialDraft,
  submitLabel,
  onSubmit,
  onCancel,
}: InvoiceCustomerFormProps) {
  const t = useTranslations("admin.invoiceCustomers");
  const c = useTranslations("common");

  const [draft, setDraft] = useState<InvoiceCustomerDraft>(initialDraft);
  const [error, setError] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);

  /**
   * The fields' own labels, keyed concretely.
   *
   * Built the way the fee rows build theirs and for the same reason: a
   * `t(\`fields.${field}\`)` would hand next-intl a key it cannot see, and the
   * compile-time check on this namespace is the only thing standing between a
   * renamed key and a page that renders its own key names.
   */
  const fieldLabel: Record<InvoiceCustomerField, string> = {
    fennoa_customer_no: t("fields.number"),
    invoice_name: t("fields.invoiceName"),
    street: t("fields.street"),
    postal_code: t("fields.postalCode"),
    city: t("fields.city"),
    country_code: t("fields.country"),
    your_reference: t("fields.yourReference"),
    invoice_text: t("fields.invoiceText"),
  };

  /** One controlled text field, changed by name. */
  const set = (field: InvoiceCustomerField) => (value: string) =>
    setDraft((current) => ({ ...current, [field]: value }));

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const result = validateInvoiceCustomerDraft(draft);
    if (!result.ok) {
      setError(
        result.reason === "required"
          ? t("errors.required", { field: fieldLabel[result.field] })
          : t("errors.countryShape"),
      );
      return;
    }

    // Set before the first render after the click, never inside a success
    // handler: a second submit while the first is in flight would create a
    // second customer under a number the first one is about to take.
    setCommitting(true);
    try {
      await onSubmit(result.input);
    } catch (failure) {
      // Cleared only here. The success path leaves the page, and a button that
      // re-enabled on the way out is the double-submit this flag exists for.
      setCommitting(false);
      const reason = invoiceCustomerSaveFailure(failure);
      setError(
        reason.kind === "duplicate"
          ? t("errors.duplicateNumber", { number: result.input.fennoa_customer_no })
          : reason.kind === "reason"
            ? t("errors.saveFailedWithReason", { reason: reason.reason })
            : t("errors.saveFailed"),
      );
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardContent className="space-y-4 p-6">
          <Field
            label={fieldLabel.fennoa_customer_no}
            htmlFor="invoice-customer-number"
            hint={t("hints.number")}
          >
            {({ hintId }) => (
              <Input
                id="invoice-customer-number"
                value={draft.fennoa_customer_no}
                onChange={(event) =>
                  set("fennoa_customer_no")(event.target.value)
                }
                aria-describedby={hintId}
                // The Fennoa card spells it `F0037`: a machine key a person
                // copies rather than reads, which is the machine face's whole
                // remit, and the one field here where a lookalike character
                // would produce an invoice that silently matches nobody.
                className="font-mono"
                autoComplete="off"
              />
            )}
          </Field>

          <Field
            label={fieldLabel.invoice_name}
            htmlFor="invoice-customer-name"
            hint={t("hints.invoiceName")}
          >
            {({ hintId }) => (
              <Input
                id="invoice-customer-name"
                value={draft.invoice_name}
                onChange={(event) => set("invoice_name")(event.target.value)}
                aria-describedby={hintId}
                autoComplete="off"
              />
            )}
          </Field>

          <Field label={fieldLabel.street} htmlFor="invoice-customer-street">
            <Input
              id="invoice-customer-street"
              value={draft.street}
              onChange={(event) => set("street")(event.target.value)}
              autoComplete="off"
            />
          </Field>

          {/* Three short fields that are one answer, side by side from the small
              breakpoint up and stacked below it. The postal code is given a
              narrow box because it is five characters wide, and a full-width
              box for five characters reads as a field somebody forgot to fill
              in. The country is shown but not editable: every customer this
              feature invoices is Finnish — Finvoice is Finland's e-invoicing
              format and the municipality club is a Finnish product — so the
              draft carries FI and the box states it rather than asking. */}
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="sm:w-40">
              <Field
                label={fieldLabel.postal_code}
                htmlFor="invoice-customer-postal-code"
              >
                <Input
                  id="invoice-customer-postal-code"
                  value={draft.postal_code}
                  onChange={(event) => set("postal_code")(event.target.value)}
                  autoComplete="off"
                />
              </Field>
            </div>
            <div className="flex-1">
              <Field label={fieldLabel.city} htmlFor="invoice-customer-city">
                <Input
                  id="invoice-customer-city"
                  value={draft.city}
                  onChange={(event) => set("city")(event.target.value)}
                  autoComplete="off"
                />
              </Field>
            </div>
            <div className="sm:w-24">
              <Field
                label={fieldLabel.country_code}
                htmlFor="invoice-customer-country"
              >
                <Input
                  id="invoice-customer-country"
                  value={draft.country_code}
                  readOnly
                  disabled
                  className="font-mono uppercase"
                />
              </Field>
            </div>
          </div>

          <Field
            label={fieldLabel.your_reference}
            htmlFor="invoice-customer-your-reference"
            optional
            hint={t("hints.yourReference")}
          >
            {({ hintId }) => (
              <Input
                id="invoice-customer-your-reference"
                value={draft.your_reference}
                onChange={(event) => set("your_reference")(event.target.value)}
                aria-describedby={hintId}
                autoComplete="off"
              />
            )}
          </Field>

          <Field
            label={fieldLabel.invoice_text}
            htmlFor="invoice-customer-invoice-text"
            optional
            hint={t("hints.invoiceText")}
          >
            {({ hintId }) => (
              <Textarea
                id="invoice-customer-invoice-text"
                value={draft.invoice_text}
                onChange={(event) => set("invoice_text")(event.target.value)}
                aria-describedby={hintId}
                rows={3}
              />
            )}
          </Field>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Negative first in the DOM, affirmative last: rightmost in a row, and
          topmost once the row reverses into a stack. */}
      <div className="flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {c("cancel")}
        </Button>
        <Button type="submit" size="lg" disabled={committing}>
          {committing && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
