import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";

// Consumer clubs are listed with every other product type, narrowed by type.
export default async function ConsumerClubsPage() {
  redirect({
    href: ROUTES.admin.productList("consumer_club"),
    locale: await getLocale(),
  });
}
