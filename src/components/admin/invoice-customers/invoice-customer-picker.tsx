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
  const { data: customers, isError } = useInvoiceCustomers();
  const errorId = useId();

  // The read has answered with a list — and having answered once, it stays
  // answered. A background refetch that fails leaves the cached rows in place
  // and only flips the error flag, so the fact the control waits on is the
  // presence of the list, never the absence of an error: keying off the flag
  // would blank a working picker because a refresh the admin never asked for
  // timed out. Everything the control can safely say — its options, the linked
  // customer as the selected one, the ability to change it — waits on this one
  // fact, because a list that is not there cannot hold the row the form is
  // pointing at.
  const settled = customers !== undefined;
  // A failure with nothing cached behind it is the only failure the admin has
  // to be told about: with a list in hand the control still answers the
  // question correctly, and a stale one is the same list a moment older.
  const listUnavailable = isError && customers === undefined;

  return (
    <div className="flex flex-col gap-2.5">
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
          <select
            id="invoice-customer"
            // The empty string is the control's spelling of "no answer" — a
            // `select` has no null — and it is converted at this boundary so
            // nothing downstream has two ways to say unset.
            value={settled ? (value ?? "") : ""}
            onChange={(event) => onChange(event.target.value || null)}
            aria-describedby={
              listUnavailable
                ? [hintId, errorId].filter(Boolean).join(" ")
                : hintId
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
            // **A first read that FAILED is the same emptiness that never
            // ends**, and it is the case where showing "Not set" would be a lie
            // rather than a first frame: the club's customer is in the form
            // state either way, and a control offering one option, selected,
            // would tell the admin this club has no buyer and let them save
            // that. So the empty, inert box stays, and the line at the end of
            // the field says why it is empty — the field cannot be answered
            // until the list can be read, and the answer already stored is
            // untouched.
            disabled={!settled}
            className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            {settled && (
              <>
                <option value="">{c("notSet")}</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {t("picker.option", {
                      name: customer.invoice_name,
                      number: customer.fennoa_customer_no,
                    })}
                  </option>
                ))}
              </>
            )}
          </select>
        )}
      </Field>
      {/* Below the hint, at the end of the field, because this line arrives on
          the query's schedule rather than the admin's. The select's own box is
          rendered at its final size from the first frame and never moves, and
          placing the line after the hint keeps the hint where it was too; the
          sections below the fees card still move down by the line's height
          when it appears, which is accepted — a slot reserved for a line that
          almost never appears would be dead space under every club form. The
          order is load-bearing: a tidy-up that moved this back up beside the
          control would look tidier and would push the hint down as well. */}
      {listUnavailable && (
        <p id={errorId} className="text-sm text-destructive">
          {t("errors.listUnavailable")}
        </p>
      )}
    </div>
  );
}
