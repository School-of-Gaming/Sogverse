import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";

// Events are listed with every other product type, narrowed by type.
export default async function EventsPage() {
  redirect({
    href: ROUTES.admin.productList("event"),
    locale: await getLocale(),
  });
}
