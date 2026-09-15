"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Field } from "@/components/ui/field";
import { ROUTES } from "@/lib/constants";
import { useInvoiceCustomers } from "@/services/invoice-customers";

/**
 * Which Fennoa customer a municipality club's sessions are invoiced to.
 *
 * **Mounted only for a municipality club**, which is also what keeps the read
 * off every other product form: no other type may carry a customer at all — the
 * table refuses one — so a picker on a camp would be asking a question with no
 * answer the database would accept.
 *
 * **The empty option is a real answer and the resting one.** A club is created
 * before the agreement behind it is signed, so "nobody has said yet" is an
 * ordinary state rather than a gap in the form; what makes it safe to leave is
 * that the invoicing page reports it at the point a file would have been
 * produced, which the hint says in so many words.
 *
 * **A native `select`, hand-styled to match the fee rows beside it.** There is
 * no select primitive in this app yet and this is not the change that adds one
 * (`TODO.md` carries the sweep, and it converts every hand-styled select at
 * once); a control in the middle of the fees card that focused differently from
 * the three above it would be a visible seam bought for nothing.
 */
export function InvoiceCustomerPicker({
  value,
  onChange,
}: {
  /** The customer's row id, or null for "not set". */
  value: string | null;
  onChange: (invoiceCustomerId: string | null) => void;
}) {
  const t = useTranslations("admin.invoiceCustomers");
  const c = useTranslations("common");
  const { data: customers, isPending, isError } = useInvoiceCustomers();
  const errorId = useId();

  // The read has answered with a list. Everything the control can safely say —
  // its options, the linked customer as the selected one, the ability to change
  // it — waits on this one fact, because a list that is not there cannot hold
  // the row the form is pointing at.
  const settled = !isPending && !isError;

  return (
    <Field
      label={t("picker.label")}
      htmlFor="invoice-customer"
      hint={t("picker.hint")}
      labelAction={
        <Link
          href={ROUTES.admin.invoiceCustomers}
          className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          {t("picker.manage")}
        </Link>
      }
    >
      {({ hintId }) => (
        <>
          <select
            id="invoice-customer"
            // The empty string is the control's spelling of "no answer" — a
            // `select` has no null — and it is converted at this boundary so
            // nothing downstream has two ways to say unset.
            value={settled ? (value ?? "") : ""}
            onChange={(event) => onChange(event.target.value || null)}
            aria-describedby={
              isError ? [hintId, errorId].filter(Boolean).join(" ") : hintId
            }
            // Empty and inert until the list lands, rather than showing the
            // options it has: the "not set" option is the one a browser falls back
            // to when nothing matches, so a club that HAS a customer would spend
            // the first frames claiming it has none — the one wrong answer this
            // field can give. The box is already the size it will keep, so nothing
            // moves when the names arrive. It is a small indexed read of a few
            // dozen rows and lands in a frame or two; if it ever does not, that is
            // an anomaly to investigate rather than a state to design for.
            //
            // **A read that FAILED is the same emptiness that never ends**, and
            // it is the case where showing "Not set" would be a lie rather than
            // a first frame: the club's customer is in the form state either
            // way, and a control offering one option, selected, would tell the
            // admin this club has no buyer and let them save that. So the empty,
            // inert box stays, and the line below says why it is empty — the
            // field cannot be answered until the list can be read, and the
            // answer already stored is untouched.
            disabled={!settled}
            className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            {settled && <option value="">{c("notSet")}</option>}
            {(customers ?? []).map((customer) => (
              <option key={customer.id} value={customer.id}>
                {t("picker.option", {
                  name: customer.invoice_name,
                  number: customer.fennoa_customer_no,
                })}
              </option>
            ))}
          </select>
          {isError && (
            <p id={errorId} className="text-sm text-destructive">
              {t("errors.listUnavailable")}
            </p>
          )}
        </>
      )}
    </Field>
  );
}
