"use client";

import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";

/**
 * The chrome both customer forms sit in: the way back to the list, the page's
 * title, and whatever is being asked underneath.
 *
 * One component rather than the same nine lines in the create page, the edit
 * page and the preview scene — which is also what lets the scene render the
 * *page* rather than a form floating in an admin layout. Everything here is on
 * screen from the first frame: nothing in it waits on a read, so a reader can
 * leave before the form arrives.
 */
export function InvoiceCustomerPageShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const t = useTranslations("admin.invoiceCustomers");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href={ROUTES.admin.invoiceCustomers}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("backToList")}
      </Link>

      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>

      {children}
    </div>
  );
}
