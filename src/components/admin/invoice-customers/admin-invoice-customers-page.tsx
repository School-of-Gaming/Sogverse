"use client";

import { Check, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { NavChevron } from "@/components/ui/nav-chevron";
import { ROUTES } from "@/lib/constants";
import type { InvoiceCustomerRow } from "@/services/invoice-customers";

/**
 * Every Fennoa invoice customer, one row each.
 *
 * **Presentational, and that is what the preview scene rides on**: the rows
 * arrive as a prop, so the live page hands it a read and the scene hands it
 * fixtures, and there is one body between them. `settled` is separate from the
 * rows because "no customers yet" and "the read has not answered" are different
 * pages, and only the first of them may print an empty state.
 *
 * **No loading affordance.** The table is the whole table — a few dozen rows of
 * contract data that only ever grows by an agreement being signed — read by a
 * single indexed walk that lands in a frame or two. The chrome and the column
 * headers are on screen from the first frame, at the size they will keep, and
 * the rows fill in beneath them.
 *
 * **The whole row opens the customer**, through the stretched-link shape the
 * sites table uses: the name is the anchor and its `::after` covers the row, so
 * the accessible name is the customer's name, the focus ring lands on words, and
 * there is no second empty link duplicating it.
 */
export function AdminInvoiceCustomersPage({
  customers,
  settled,
}: {
  /** In the order the read delivers: by invoice name, then id. */
  customers: readonly InvoiceCustomerRow[];
  /** Whether the read has answered. Only then may the empty state appear. */
  settled: boolean;
}) {
  const t = useTranslations("admin.invoiceCustomers");

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Link
          href={ROUTES.admin.invoiceCustomerNew}
          className={buttonVariants({ className: "gap-1.5" })}
        >
          <Plus className="h-4 w-4" />
          {t("addCustomer")}
        </Link>
      </div>

      <Card>
        <CardContent>
          {/* A table stays a table on an admin surface; below the design floor
              it scrolls inside its own container rather than the document. */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th scope="col" className="w-32 px-3 py-2 font-medium">
                    {t("columns.number")}
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    {t("columns.invoiceName")}
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    {t("columns.city")}
                  </th>
                  <th scope="col" className="w-28 px-3 py-2 font-medium">
                    {t("columns.reference")}
                  </th>
                  {/* The chevron's column. Deliberately unlabelled: it holds a
                      decorative mark rather than data, and its header is what a
                      screen reader would otherwise announce before every
                      cell. */}
                  <th scope="col" className="w-8 px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr
                    key={customer.id}
                    className="group relative border-b border-border transition-colors last:border-b-0 hover:bg-hover focus-within:bg-lifted"
                  >
                    <td className="px-3 py-2 font-mono text-muted-foreground">
                      {customer.fennoa_customer_no}
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={ROUTES.admin.invoiceCustomer(customer.id)}
                        className="rounded font-medium after:absolute after:inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-act"
                      >
                        {customer.invoice_name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {customer.city}
                    </td>
                    {/* A mark, not a word: the column is scanned down rather
                        than read across, and the tick is announced by the
                        sentence beside it because an icon says nothing to a
                        reader who cannot see it. */}
                    <td className="w-28 px-3 py-2 text-muted-foreground">
                      {customer.your_reference !== null && (
                        <Check className="h-4 w-4" aria-hidden />
                      )}
                      <span className="sr-only">
                        {customer.your_reference !== null
                          ? t("hasReference")
                          : t("noReference")}
                      </span>
                    </td>
                    <td className="w-8 px-3 py-2">
                      <NavChevron size="sm" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {settled && customers.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("empty")}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
